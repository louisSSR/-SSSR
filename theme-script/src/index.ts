import image from '../assets/shiro-puppet-sheet.png';
import peekImage from '../assets/shiro-peek-head-hands.png';
import { startThemeScript } from './runtime';

// Tavern Helper imports this into its unsandboxed script iframe after providing these helpers.
let cancelled = false;
const cancelReady = () => { cancelled = true; };
window.addEventListener('pagehide', cancelReady, { once: true });
$(function () {
  if (cancelled) return;
  window.removeEventListener('pagehide', cancelReady);
  startThemeScript(window, image, (name, listener) => {
    const event = getButtonEvent(name), handle = eventOn(event, listener);
    // 4.8.18 wraps listeners; remove by the original listener as well as its returned handle.
    return { stop: () => { handle.stop(); eventRemoveListener(event, listener); } };
  }, peekImage);
});
