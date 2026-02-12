import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import prisma from '@/lib/prisma'

const PAYSTACK_BASE = 'https://api.paystack.co'

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('Missing PAYSTACK_SECRET_KEY')
  return key
}

function getBaseUrl(req: Request): string {
  const host = req.headers.get('host') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  if (host) return `${proto === 'https' ? 'https' : 'http'}://${host}`
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { orderId } = body
    if (!orderId) {
      return new NextResponse('Order ID is required', { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId, userId: session.user.id },
      include: { shippingAddress: true },
    })

    if (!order) {
      return new NextResponse('Order not found', { status: 404 })
    }

    if (order.stripePaymentId) {
      return new NextResponse('Order is already paid', { status: 400 })
    }

    const shipping = 10
    const tax = order.total * 0.1
    const totalAmount = order.total + shipping + tax
    // Amount in subunits: kobo for NGN, cents for USD
    const amountInSubunits = Math.round(totalAmount * 100)
    const currency = (process.env.PAYSTACK_CURRENCY as string) || 'NGN'
    const reference = `order_${order.id}_${Date.now()}`.replace(/[^a-zA-Z0-9._-]/g, '_')
    const baseUrl = getBaseUrl(req)
    const callbackUrl = `${baseUrl}/order-confirmation/${order.id}`

    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getSecretKey()}`,
      },
      body: JSON.stringify({
        email: session.user.email!,
        amount: amountInSubunits,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          order_id: order.id,
          user_id: session.user.id,
        },
      }),
    })

    const data = await res.json()
    if (!data.status || !data.data?.authorization_url) {
      console.error('[PAYMENT] Paystack initialize failed:', data)
      return new NextResponse(data.message || 'Failed to initialize payment', {
        status: 502,
      })
    }

    return NextResponse.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    })
  } catch (error) {
    console.error('[PAYMENT_ERROR]', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}
