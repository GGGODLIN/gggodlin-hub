const root = document.documentElement;
const toggle = document.getElementById('theme-toggle');
const apply = (mode) => {
  root.setAttribute('data-mode', mode);
  toggle.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
};
const saved = localStorage.getItem('gggodlin-mode');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
apply((saved ?? (prefersDark ? 'dark' : 'light')) === 'dark' ? 'dark' : 'light');
toggle.addEventListener('click', () => {
  const next = root.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
  apply(next);
  localStorage.setItem('gggodlin-mode', next);
});
