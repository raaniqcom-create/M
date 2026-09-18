import type { CSSProperties } from 'react';
const paths = {
 car: 'M5 17H3v-6l2-6h14l2 6v6h-2M5 17h14M3 11h18M7 14h.01M17 14h.01M5 17v3M19 17v3',
 drop: 'M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z',
 pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
 heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
 calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2',
 arrow: 'M19 12H5m6-6-6 6 6 6',
 chevron: 'm9 5 7 7-7 7',
 down: 'm6 9 6 6 6-6',
 filter: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
 clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2',
 check: 'm5 12 4 4L19 6',
 star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
 home: 'm3 10 9-8 9 8v11h-6v-7H9v7H3Z',
 tag: 'M20 13 11 22 2 13V2h11l9 9-2 2ZM7 7h.01',
 phone: 'M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4c-1 4-8 2-13-3S1 4 5 3Z',
 route: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
 close: 'm6 6 12 12M18 6 6 18',
 grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
};
export type WashIconName = keyof typeof paths;
export function WashUIIcon({name,size=20,filled=false,style}:{name:WashIconName;size?:number;filled?:boolean;style?:CSSProperties}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]}/></svg>;
}
