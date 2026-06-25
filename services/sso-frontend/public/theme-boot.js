(function () {
  const theme = localStorage.getItem('dev-sso-theme') || 'auto';
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
})();
