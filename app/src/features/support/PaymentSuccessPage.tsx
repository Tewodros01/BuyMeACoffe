import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, Coffee } from 'lucide-react'
import { supportApi } from './supportApi'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/index'
import { haptic } from '../../lib/telegram'

export default function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const txRef = params.get('ref')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify', txRef],
    queryFn: () => supportApi.verify(txRef!),
    enabled: !!txRef,
    retry: 3,
    retryDelay: 2000,
  })

  useEffect(() => {
    if (data?.status === 'completed' || data?.status === 'already_completed') haptic('success')
    if (isError) haptic('error')
  }, [data, isError])

  if (!txRef) return <div className="flex items-center justify-center min-h-screen"><p className="text-[#7c7c9a]">Invalid payment link</p></div>

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Spinner className="w-10 h-10" />
        <p className="text-[#7c7c9a] text-sm">Verifying your payment…</p>
      </div>
    )
  }

  const success = data?.status === 'completed' || data?.status === 'already_completed'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-6 fade-in">
      <div className={`w-24 h-24 rounded-full flex items-center justify-center ${success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
        {success
          ? <CheckCircle className="w-12 h-12 text-emerald-400" />
          : <XCircle className="w-12 h-12 text-red-400" />
        }
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#e2e2f0]">
          {success ? 'Payment Successful!' : 'Payment Failed'}
        </h1>
        <p className="text-sm text-[#7c7c9a] mt-2">
          {success
            ? 'Your support has been received. Thank you! ☕'
            : 'Something went wrong. Please try again.'}
        </p>
        {txRef && <p className="text-xs text-[#4a4a6a] mt-2 font-mono">Ref: {txRef}</p>}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button fullWidth onClick={() => navigate(-1)}>
          <Coffee className="w-4 h-4" />
          {success ? 'Back to Creator' : 'Try Again'}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => navigate('/home')}>
          Go Home
        </Button>
      </div>
    </div>
  )
}
