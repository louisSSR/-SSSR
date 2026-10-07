import { createApp, nextTick, watch, type App as VueApp, type WatchStopHandle } from 'vue';
import App from './App.vue';
import style from './style.css';
import mascotStyle from './mascot.css';
import { createController, type Controller } from './controller';
import { context, MODULE_ID } from './host';
import { createDatabaseAppearance, type DatabaseAppearance } from './appearance';
import { observeDatabaseVisibility } from './database-visibility';
let mount:HTMLElement|undefined,app:VueApp|undefined,controller:Controller|undefined,settingButton:HTMLButtonElement|undefined;
let readyListener:(()=>void)|undefined,started=false,disabled=false;
let stopOpenWatch:WatchStopHandle|undefined,observer:MutationObserver|undefined,returnFocus:HTMLElement|undefined;
let stopViewport:(()=>void)|undefined;
let appearance:DatabaseAppearance|undefined,stopDatabaseVisibility:(()=>void)|undefined;
const uiKey=Symbol.for('shiro-butterfly-shop:ui-v1');
const uiEvent='shiro-butterfly-shop:availability';
const uiService={version:1,open:(tab:'memory'|'quests')=>{if(!disabled&&controller&&(tab==='memory'||tab==='quests')){controller.state.tab=tab;controller.open();}}};
const ownerKey=Symbol.for(`${MODULE_ID}:active-mount`);
const owner={dispose:()=>onDisable()};
function claimOwnership(){
  const registry=globalThis as any,previous=registry[ownerKey];
  if(previous&&previous!==owner)previous.dispose();
  registry[ownerKey]=owner;
}
function deepestActive():HTMLElement|undefined{
  let active:Element|null=document.activeElement;
  while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
  return active instanceof HTMLElement?active:undefined;
}
function focusable(layer:Element):HTMLElement[]{
  return [...layer.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length>0&&!el.hidden);
}
const assetUrl=new URL('./assets/shiro.png',import.meta.url).href;
function start(){
  if(started||disabled)return;claimOwnership();started=true;
  // The host applies transform/perspective to <html>, whose layout height may be zero.
  // A manual popover enters the browser top layer without making the host inert.
  // Explicit dimensions also provide a usable fallback when Popover API is absent.
  document.getElementById(MODULE_ID)?.remove();document.getElementById(`${MODULE_ID}-settings`)?.remove();
  mount=document.createElement('div');mount.id=MODULE_ID;mount.setAttribute('popover','manual');
  mount.style.cssText='position:fixed;inset:0;width:100dvw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;contain:layout style;z-index:2147482999;pointer-events:none';
  const shadow=mount.attachShadow({mode:'open'}),css=document.createElement('style'),container=document.createElement('div');
  css.textContent=style+'\n'+mascotStyle+'\n.launcher,.veil{pointer-events:auto}';shadow.append(css,container);document.body.append(mount);
  if(typeof mount.showPopover==='function')mount.showPopover();else mount.removeAttribute('popover');
  // A phone keyboard can shrink only the visual viewport, leaving 100dvh unchanged.
  // Resize our own surface; never change the host viewport meta or disable pinch zoom.
  const surface=mount,viewport=window.visualViewport;
  let viewportFrame=0;
  const fitViewport=()=>{
    viewportFrame=0;
    if(viewport&&Math.abs(viewport.scale-1)>.05)return;
    const width=viewport?.width??window.innerWidth,height=viewport?.height??window.innerHeight;
    if(width<=0||height<=0)return;
    Object.assign(surface.style,{inset:'auto',left:`${viewport?.offsetLeft??0}px`,top:`${viewport?.offsetTop??0}px`,width:`${width}px`,height:`${height}px`});
    surface.toggleAttribute('data-compact-height',height<=480);
    const active=deepestActive();
    if(active&&shadow.contains(active)&&active.matches('input,textarea,select')){
      const scroller=active.closest<HTMLElement>('.modal,.content');
      if(scroller){
        const field=active.getBoundingClientRect(),box=scroller.getBoundingClientRect();
        if(field.bottom>box.bottom-16)scroller.scrollTop+=field.bottom-box.bottom+16;
        else if(field.top<box.top+16)scroller.scrollTop+=field.top-box.top-16;
      }
    }
  };
  const queueViewport=()=>{if(!viewportFrame)viewportFrame=requestAnimationFrame(fitViewport);};
  viewport?.addEventListener('resize',queueViewport);viewport?.addEventListener('scroll',queueViewport);
  window.addEventListener('resize',queueViewport);
  stopViewport=()=>{cancelAnimationFrame(viewportFrame);viewport?.removeEventListener('resize',queueViewport);viewport?.removeEventListener('scroll',queueViewport);window.removeEventListener('resize',queueViewport);};
  fitViewport();
  appearance=createDatabaseAppearance();
  stopDatabaseVisibility=observeDatabaseVisibility(visible=>surface.toggleAttribute('data-native-database-open',visible));
  controller=createController();app=createApp(App,{controller,assetUrl,appearance});app.mount(container);void controller.start();
  (globalThis as any)[uiKey]=uiService;document.dispatchEvent(new CustomEvent(uiEvent));
  settingButton=document.createElement('button');settingButton.id=`${MODULE_ID}-settings`;settingButton.className='menu_button';settingButton.textContent='♛ 白 · 蝶翼商店';settingButton.onclick=()=>controller?.open();
  document.querySelector('#extensions_settings2,#extensions_settings')?.append(settingButton);
  let focusLayer:HTMLElement|null=null;
  const layerOpeners=new WeakMap<HTMLElement,HTMLElement>();
  const currentLayer=()=>[...shadow.querySelectorAll<HTMLElement>('.modal')].at(-1)??shadow.querySelector<HTMLElement>('.window');
  const focusCurrentLayer=()=>{
    if(!controller?.state.open)return;
    const layer=currentLayer();if(!layer||layer===focusLayer)return;
    const prior=focusLayer;focusLayer=layer;
    if(prior&&layerOpeners.has(prior)){const opener=layerOpeners.get(prior);if(opener?.isConnected&&layer.contains(opener)){opener.focus();return;}}
    const active=deepestActive();if(active&&active!==document.body)layerOpeners.set(layer,active);
    (focusable(layer)[0]??layer).focus();
  };
  stopOpenWatch=watch(()=>controller?.state.open,(open)=>{
    if(open){returnFocus=deepestActive();void nextTick(focusCurrentLayer);}
    else{focusLayer=null;const previous=returnFocus;returnFocus=undefined;void nextTick(()=>{if(previous?.isConnected)previous.focus();else shadow.querySelector<HTMLButtonElement>('.launcher')?.focus();});}
  },{flush:'sync'});
  observer=new MutationObserver(()=>focusCurrentLayer());observer.observe(container,{childList:true,subtree:true});
  // Keyboard handling is owned by this widget, never by host document styles or listeners.
  shadow.addEventListener('keydown',(e:Event)=>{
    const event=e as KeyboardEvent;if(!controller?.state.open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      const modal=[...shadow.querySelectorAll<HTMLElement>('.modal')].at(-1);
      if(modal)modal.querySelector<HTMLButtonElement>('.modal-close,button[aria-label^="关闭"]')?.click();else controller.close();
      return;
    }
    if(event.key!=='Tab')return;
    const layer=currentLayer();if(!layer)return;
    const items=focusable(layer),first=items[0],last=items.at(-1),active=deepestActive();
    if(event.shiftKey&&(active===first||!active||!layer.contains(active))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(active===last||!active||!layer.contains(active))){event.preventDefault();first?.focus();}
  },{capture:true});
}
export function onActivate(){
  claimOwnership();disabled=false;const c=context();if(readyListener)c.eventSource.removeListener(c.eventTypes.APP_READY,readyListener);
  readyListener=()=>{readyListener=undefined;start();};c.eventSource.once(c.eventTypes.APP_READY,readyListener);
  // APP_READY is emitted after initial extension loading; enable handles an already running host.
}
export function onEnable(){disabled=false;start();}
export function onDisable(){
  disabled=true;const c=context();if(readyListener){c.eventSource.removeListener(c.eventTypes.APP_READY,readyListener);readyListener=undefined;}
  stopOpenWatch?.();stopOpenWatch=undefined;observer?.disconnect();observer=undefined;
  stopViewport?.();stopViewport=undefined;
  stopDatabaseVisibility?.();stopDatabaseVisibility=undefined;appearance?.dispose();appearance=undefined;
  if((globalThis as any)[uiKey]===uiService){delete (globalThis as any)[uiKey];document.dispatchEvent(new CustomEvent(uiEvent));}
  void controller?.dispose();app?.unmount();mount?.remove();settingButton?.remove();controller=undefined;app=undefined;mount=undefined;settingButton=undefined;started=false;
  if(returnFocus?.isConnected)returnFocus.focus();returnFocus=undefined;
  if((globalThis as any)[ownerKey]===owner)delete (globalThis as any)[ownerKey];
}
export function onDelete(){onDisable();}
