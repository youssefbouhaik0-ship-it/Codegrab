// onboarding.ts

document.addEventListener('DOMContentLoaded', async () => {
  const steps = {
    welcome: document.getElementById('step-welcome')!,
    permissions: document.getElementById('step-permissions')!,
    restart: document.getElementById('step-restart')!,
  };

  const screenStatus = document.getElementById('screen-status')!;
  const permissionsHint = document.getElementById('permissions-hint')!;
  const btnContinue = document.getElementById('btn-next-restart') as HTMLButtonElement;
  const btnSetupPermissions = document.getElementById('btn-next-permissions') as HTMLButtonElement;

  let screenGranted = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // ── Check permissions up front ──────────────────────────────────────────

  async function checkPermissions() {
    try {
      screenGranted = await window.electronAPI.checkScreenRecording();
    } catch {
      // If API not available, assume not granted
    }
    updatePermissionUI();
  }

  await checkPermissions();

  // If screen recording already granted, skip straight to Get Started
  if (screenGranted) {
    btnSetupPermissions.textContent = 'Get Started';
    btnSetupPermissions.addEventListener('click', () => {
      window.electronAPI.closeOnboarding();
    });
  } else {
    btnSetupPermissions.addEventListener('click', () => {
      goToStep('permissions');
    });
  }

  // ── Step navigation ───────────────────────────────────────────────────────

  function goToStep(stepName: 'welcome' | 'permissions' | 'restart') {
    Object.values(steps).forEach((el) => el.setAttribute('data-active', 'false'));
    steps[stepName].setAttribute('data-active', 'true');

    if (stepName === 'permissions') {
      checkPermissions();
      startPolling();
    } else {
      stopPolling();
    }
  }

  // ── Permission UI ─────────────────────────────────────────────────────────

  function updatePermissionUI() {
    if (screenGranted) {
      screenStatus.textContent = 'Granted';
      screenStatus.classList.add('permission-card__status--granted');
      document.getElementById('perm-screen')!.classList.add('permission-card--granted');
      btnContinue.disabled = false;
      permissionsHint.textContent = 'Screen Recording granted. You\'re ready to go!';
    } else {
      screenStatus.textContent = 'Not granted';
      screenStatus.classList.remove('permission-card__status--granted');
      document.getElementById('perm-screen')!.classList.remove('permission-card--granted');
      btnContinue.disabled = true;
      permissionsHint.textContent = 'Grant Screen Recording to get started.';
    }
  }

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(checkPermissions, 2000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  document.getElementById('btn-grant-screen')!.addEventListener('click', () => {
    window.electronAPI.openScreenRecordingSettings();
  });

  // Permissions > Continue (goes to restart page)
  document.getElementById('btn-next-restart')!.addEventListener('click', () => {
    goToStep('restart');
  });

  document.getElementById('btn-restart')!.addEventListener('click', () => {
    window.electronAPI.closeOnboarding();
    window.electronAPI.relaunchApp();
  });

  document.getElementById('btn-skip')!.addEventListener('click', () => {
    window.electronAPI.closeOnboarding();
  });
});
