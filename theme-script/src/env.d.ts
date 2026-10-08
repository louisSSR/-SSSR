declare module '*.css' { const text: string; export default text; }
declare module '*.png' { const dataUri: string; export default dataUri; }
declare function $(callback: () => void): void;
declare function getButtonEvent(name: string): string;
declare function eventOn(name: string, listener: () => void): { stop: () => void };
declare function eventRemoveListener(name: string, listener: () => void): void;
