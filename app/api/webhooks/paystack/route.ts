import { NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('Missing PAYSTACK_SECRET_KEY')
  return key
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac('sha512', secret).update(payload).digest('hex')
  return hash === signature
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  if (!signature) {
    return new NextResponse('Missing x-paystack-signature', { status: 400 })
  }

  const secret = getSecretKey()
  if (!verifySignature(rawBody, signature, secret)) {
    console.error('[PAYSTACK_WEBHOOK] Invalid signature')
    return new NextResponse('Invalid signature', { status: 400 })
  }

  let event: { event: string; data?: { reference?: string; metadata?: { order_id?: string } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  try {
    if (event.event === 'charge.success' && event.data) {
      const orderId = event.data.metadata?.order_id ?? (event.data as { order_id?: string }).order_id
      const reference = event.data.reference

      if (!orderId) {
        console.warn('[PAYSTACK_WEBHOOK] charge.success missing order_id in metadata')
        return NextResponse.json({ received: true })
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PROCESSING',
          stripePaymentId: reference ?? undefined,
        },
      })
      console.log('[PAYSTACK_WEBHOOK] Order marked as PROCESSING:', orderId)
    }
  } catch (error) {
    console.error('[PAYSTACK_WEBHOOK] Handler error:', error)
    return new NextResponse('Webhook handler failed', { status: 500 })
  }

  return NextResponse.json({ received: true })
}
