import { FormEvent, useEffect, useState } from 'react'

type Status = 'idle' | 'saving' | 'testing'

export default function BrokerSettingsPage(): JSX.Element {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function refreshConnected(): Promise<void> {
    setConnected(await window.api.broker.hasCredentials())
  }

  useEffect(() => {
    refreshConnected()
  }, [])

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!clientId || !clientSecret) return
    setStatus('saving')
    setMessage(null)
    try {
      await window.api.broker.saveCredentials(clientId, clientSecret)
      setClientId('')
      setClientSecret('')
      await refreshConnected()

      setStatus('testing')
      const quotes = await window.api.broker.getQuotes(['005930'])
      if (quotes.length > 0) {
        setMessage({
          type: 'success',
          text: `연결 확인 완료 — 삼성전자(005930) 현재가 ${quotes[0].lastPrice.toLocaleString()}${quotes[0].currency}`
        })
      } else {
        setMessage({ type: 'error', text: '연결은 됐지만 시세 응답이 비어 있습니다. 심볼을 확인해주세요.' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setStatus('idle')
    }
  }

  async function handleDisconnect(): Promise<void> {
    await window.api.broker.clearCredentials()
    setMessage(null)
    await refreshConnected()
  }

  return (
    <div>
      <div className="page-header">
        <h1>API 연결</h1>
        {connected !== null && (
          <div className={`summary-pill ${connected ? 'ok' : ''}`}>
            {connected ? '● 연결됨' : '○ 연결 안 됨'}
          </div>
        )}
      </div>

      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          토스증권 Open API의 <strong>시세(Market Data) 조회만</strong> 사용합니다. 이 앱은 계좌·보유종목·매수/매도
          권한이 필요한 API는 애초에 호출하지 않도록 만들어졌습니다.
        </p>

        <form className="form-grid" onSubmit={handleSave}>
          <label>
            Client ID
            <input
              type="password"
              autoComplete="off"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="tsck_live_..."
            />
          </label>
          <label>
            Client Secret
            <input
              type="password"
              autoComplete="off"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="tssk_live_..."
            />
          </label>
          <button type="submit" className="primary" disabled={status !== 'idle' || !clientId || !clientSecret}>
            {status === 'saving' ? '저장 중...' : status === 'testing' ? '연결 확인 중...' : '저장하고 연결 확인'}
          </button>
        </form>

        {message && (
          <p className={message.type === 'success' ? 'status-ok' : 'status-error'}>{message.text}</p>
        )}

        {connected && (
          <button className="link-danger" onClick={handleDisconnect} style={{ marginTop: 12 }}>
            연결 해제 (저장된 키 삭제)
          </button>
        )}
      </div>
    </div>
  )
}
