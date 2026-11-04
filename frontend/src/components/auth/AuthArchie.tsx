import { useId } from "react";

// Exact artwork from public/archie.svg; inline so only the eyes can blink.
export default function AuthArchie() {
const id = useId();
const blueId = `${id}-blue`;
const paperId = `${id}-paper`;
return (<svg xmlns="http://www.w3.org/2000/svg" className="auth-intro-archie-art" viewBox="0 15 518 385" role="img" aria-label="Archie">
  <title>Archie mascot</title>
  <defs>
    <linearGradient id={blueId} x1="95" y1="360" x2="400" y2="65" gradientUnits="userSpaceOnUse">
      <stop stopColor="#009bff" />
      <stop offset="1" stopColor="#0091ff" />
    </linearGradient>
    <clipPath id={paperId}>
      <path d="M9 195L73 340                C77 352 111 343 126 329                Q134 323 130 315L75 168Z" />
    </clipPath>
  </defs>
  
  <g id="archie">
    <path fill={`url(#${blueId})`} d="       M94 205       C94 109 167 31 260 31       C353 31 426 109 426 205       V348       C434 349 439 354 439 362       C439 370 433 376 424 376       H332       C320 376 310 367 310 354       V275       C310 246 287 222 259 222       C230 222 207 246 207 275       V354       C207 367 197 376 184 376       H97       C88 376 82 371 82 363       C81 355 86 350 94 348Z" />
    
    <path d="M9 195L73 340              C77 352 111 343 126 329              Q134 323 130 315L75 168Z" fill="#fff" />
    <g clipPath={`url(#${paperId})`} fill="none" stroke="#009cff" strokeWidth="3.6">
      <path d="M26 201L85 347                M48 193L108 340                M69 181L127 325" />
      <path d="M17 224Q51 221 85 200                M27 250Q63 246 95 225                M38 276Q72 272 106 250                M49 302Q84 296 116 276                M60 327Q97 321 126 302" />
    </g>
    <path d="M9 195L73 340              C77 352 111 343 126 329              Q134 323 130 315L75 168" fill="none" stroke="#0a194e" strokeWidth="5.6" strokeLinejoin="round" />
    <ellipse cx="42" cy="181" rx="36" ry="17" transform="rotate(-24 42 181)" fill="#fff" stroke="#0a194e" strokeWidth="5.6" />
    <ellipse cx="42.5" cy="181" rx="21" ry="7.5" transform="rotate(-24 42.5 181)" fill="#0098ff" />
    
    <path d="       M449 166       Q455 157 461 166       L506 278       Q510 287 502 291       L372 346       Q362 350 365 340Z       M432 289L472 271L458 235Z" fill="#fff" fillRule="evenodd" stroke="#0a194e" strokeWidth="5.6" strokeLinejoin="round" />
    <g fill="none" stroke="#0a194e" strokeWidth="5.4" strokeLinecap="round">
      <path d="M441 187L452 192                M434 202L445 207                M427 217L438 222                M419 232L431 237                M412 247L424 252                M405 262L417 267                M397 277L409 282                M390 292L402 297                M383 307L395 312" />
    </g>
    
    <path d="M239 160Q259 148 280 160" fill="none" stroke="#071748" strokeWidth="13" strokeLinecap="round" />
    <g fill="#fff" stroke="#071748" strokeWidth="14">
      <circle cx="194" cy="164.5" r="44.5" />
      <circle cx="326.5" cy="164.5" r="44.5" />
    </g>
    <g data-archie-eyes fill="none" stroke="#071748" strokeWidth="11" strokeLinecap="round">
      <path d="M176 171C181 153 205 153 213 171" />
      <path d="M307 171C313 153 336 153 344 171" />
    </g>
    
    <g fill={`url(#${blueId})`}>
      <circle cx="60" cy="299.5" r="32.5" />
      <circle cx="443.5" cy="315" r="33.5" />
    </g>
  </g>
  
</svg>);
}
