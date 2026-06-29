'use client'
import * as React from 'react'
import ChatWithHistoryWrap from '@/app/components/share/jk-chat-with-history'
import AuthenticatedLayout from '../../components/jk-authenticated-layout'

const AgentChat = () => {
  return (
    <AuthenticatedLayout>
      <ChatWithHistoryWrap />
    </AuthenticatedLayout>
  )
}

export default React.memo(AgentChat)
