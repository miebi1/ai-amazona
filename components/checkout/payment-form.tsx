'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface PaymentFormProps {
  orderId: string
}

export function PaymentForm({ orderId }: PaymentFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handlePayWithPaystack = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to start payment')
      }

      if (data.authorization_url) {
        window.location.href = data.authorization_url
        return
      }
      throw new Error('No payment URL received')
    } catch (error) {
      console.error('[PAYMENT_ERROR]', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Payment failed',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='space-y-6'>
      <p className='text-sm text-muted-foreground'>
        You will be redirected to Paystack to complete your payment securely.
      </p>
      <Button
        type='button'
        className='w-full'
        size='lg'
        disabled={isLoading}
        onClick={handlePayWithPaystack}
      >
        {isLoading ? 'Redirecting...' : 'Pay with Paystack'}
      </Button>
    </div>
  )
}
