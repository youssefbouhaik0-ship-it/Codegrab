// onboarding.ts

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('get-started-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      // Call the main process to close and save state
      window.electronAPI.closeOnboarding();
    });
  }
});
