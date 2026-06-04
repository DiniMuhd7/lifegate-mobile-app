import { Alert, Platform } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AlertRequest = {
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

let isInstalled = false;
let isShowing = false;
const queue: AlertRequest[] = [];

function buttonTextColor(style?: AlertButton['style']) {
  if (style === 'destructive') return '#dc2626';
  if (style === 'cancel') return '#0f766e';
  return '#0f766e';
}

function normalizeButtons(buttons?: AlertButton[]) {
  if (!buttons || buttons.length === 0) {
    return [{ text: 'OK' }] as AlertButton[];
  }
  return buttons;
}

function runNext() {
  if (isShowing || queue.length === 0) return;
  if (typeof document === 'undefined') return;

  const request = queue.shift();
  if (!request) return;

  isShowing = true;

  const buttons = normalizeButtons(request.buttons);
  const title = request.title || 'Notice';
  const message = request.message || '';

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15, 23, 42, 0.45)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.style.padding = '16px';

  const modal = document.createElement('div');
  modal.style.width = 'min(92vw, 420px)';
  modal.style.background = '#ffffff';
  modal.style.borderRadius = '14px';
  modal.style.boxShadow = '0 20px 45px rgba(15,23,42,0.28)';
  modal.style.overflow = 'hidden';
  modal.style.border = '1px solid #e2e8f0';

  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.padding = '16px 16px 6px';
  titleEl.style.fontSize = '17px';
  titleEl.style.fontWeight = '700';
  titleEl.style.color = '#0f172a';

  const messageEl = document.createElement('div');
  messageEl.textContent = message;
  messageEl.style.padding = '0 16px 14px';
  messageEl.style.fontSize = '14px';
  messageEl.style.lineHeight = '1.45';
  messageEl.style.color = '#334155';
  messageEl.style.whiteSpace = 'pre-wrap';

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '8px';
  footer.style.justifyContent = 'flex-end';
  footer.style.padding = '12px 12px 12px';
  footer.style.borderTop = '1px solid #e2e8f0';
  footer.style.background = '#f8fafc';

  const cleanup = (dismissedByBackdrop = false) => {
    window.removeEventListener('keydown', onEscape);
    overlay.remove();
    isShowing = false;
    if (dismissedByBackdrop) {
      request.options?.onDismiss?.();
    }
    runNext();
  };

  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (!request.options?.cancelable) return;
    cleanup(true);
  };

  buttons.forEach((button) => {
    const buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.textContent = button.text || 'OK';
    buttonEl.style.border = 'none';
    buttonEl.style.background = '#ffffff';
    buttonEl.style.padding = '10px 14px';
    buttonEl.style.borderRadius = '10px';
    buttonEl.style.fontSize = '14px';
    buttonEl.style.fontWeight = '700';
    buttonEl.style.cursor = 'pointer';
    buttonEl.style.color = buttonTextColor(button.style);
    buttonEl.style.boxShadow = 'inset 0 0 0 1px #cbd5e1';

    buttonEl.addEventListener('click', () => {
      cleanup(false);
      button.onPress?.();
    });

    footer.appendChild(buttonEl);
  });

  modal.appendChild(titleEl);
  if (message) {
    modal.appendChild(messageEl);
  }
  modal.appendChild(footer);
  overlay.appendChild(modal);

  overlay.addEventListener('click', (event) => {
    if (event.target !== overlay) return;
    if (!request.options?.cancelable) return;
    cleanup(true);
  });

  window.addEventListener('keydown', onEscape);
  document.body.appendChild(overlay);
}

function enqueueAlert(request: AlertRequest) {
  queue.push(request);
  runNext();
}

export function installWebAlertPolyfill() {
  if (isInstalled) return;
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const originalAlert = Alert.alert.bind(Alert);

  (Alert as any).alert = (
    title?: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => {
    if (Platform.OS !== 'web') {
      return originalAlert(title, message, buttons as any, options as any);
    }
    enqueueAlert({ title, message, buttons, options });
  };

  isInstalled = true;
}
