import * as React from 'react'

import Main from '@/app/components/share/jk-text-generation'
import AuthenticatedLayout from '../../components/jk-authenticated-layout'

const Completion = () => {
  return (
    <AuthenticatedLayout>
      <Main />
    </AuthenticatedLayout>
  )
}

export default React.memo(Completion)
