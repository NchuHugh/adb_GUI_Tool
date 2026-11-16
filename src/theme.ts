export type Theme = 'light' | 'dark'

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('theme', theme)
}

export function initializeTheme() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
}
