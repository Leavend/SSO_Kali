;(function () {
  const theme = localStorage.getItem('dev-sso-admin-theme') || 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
})()
