import { useId } from 'react'
import { useStorageUrl } from './queries'
import type { CoverName } from './types'

/** A group's cover: the uploaded photo when there is one, otherwise its illustration. */
export function GroupCover({ cover, coverPath }: { cover: CoverName; coverPath: string | null }) {
  const photo = useStorageUrl(coverPath)
  if (coverPath && photo.data) {
    return <img src={photo.data} alt="" className="block size-full object-cover" />
  }
  return <CoverArt name={cover} />
}

const svgProps = {
  viewBox: '0 0 400 200',
  preserveAspectRatio: 'xMidYMid slice',
  'aria-hidden': true,
  className: 'block size-full',
} as const

/** The prototype's five illustrated covers. */
export function CoverArt({ name }: { name: CoverName }) {
  switch (name) {
    case 'beach':
      return <Beach />
    case 'flat':
      return <Flat />
    case 'dinner':
      return <Dinner />
    case 'trip':
      return <Trip />
    case 'plain':
      return <Plain />
  }
}

function Beach() {
  return (
    <svg {...svgProps}>
      <rect width="400" height="200" fill="#DCE3FF" />
      <circle cx="300" cy="62" r="34" fill="#FFEE9A" stroke="#1B1B1A" strokeWidth="3" />
      <rect y="118" width="400" height="44" fill="#1E3FB8" />
      <path
        d="M0 132q25-10 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0M0 148q25-10 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0"
        fill="none"
        stroke="#DCE3FF"
        strokeWidth="3"
      />
      <rect y="160" width="400" height="40" fill="#EFE3B5" />
      <path d="M0 160h400" stroke="#1B1B1A" strokeWidth="3" />
      <g stroke="#1B1B1A" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M96 192c4-30 6-60 22-94" />
        <path d="M118 98c-16-14-34-14-48-4M118 98c10-18 28-24 44-18M118 98c20-6 36 2 44 14M118 98c-10 10-14 22-12 36" />
        <path d="M330 194c2-20 0-44-10-68" />
        <path d="M320 126c-12-10-26-10-36-2M320 126c8-14 22-18 34-12M320 126c14-2 26 6 30 16" />
      </g>
    </svg>
  )
}

function Flat() {
  // Pattern ids must be unique per page, or every card would share the first card's windows.
  const id = useId().replace(/:/g, '')
  const lit = `${id}-lit`
  const dark = `${id}-dark`
  return (
    <svg {...svgProps}>
      <defs>
        <pattern id={lit} width="24" height="26" patternUnits="userSpaceOnUse">
          <rect x="7" y="8" width="11" height="12" fill="#FFEE9A" />
        </pattern>
        <pattern id={dark} width="24" height="26" patternUnits="userSpaceOnUse">
          <rect x="7" y="8" width="11" height="12" fill="#1B1B1A" />
        </pattern>
      </defs>
      <rect width="400" height="200" fill="#FFEE9A" />
      <circle cx="350" cy="36" r="20" fill="#F5F5F1" stroke="#1B1B1A" strokeWidth="3" />
      <g stroke="#1B1B1A" strokeWidth="3">
        <rect x="30" y="76" width="72" height="124" fill="#1E3FB8" />
        <rect x="110" y="40" width="82" height="160" fill="#F5F5F1" />
        <rect x="200" y="92" width="62" height="108" fill="#1B1B1A" />
        <rect x="270" y="58" width="92" height="142" fill="#1E3FB8" />
      </g>
      <rect x="30" y="76" width="72" height="124" fill={`url(#${lit})`} />
      <rect x="110" y="40" width="82" height="160" fill={`url(#${dark})`} />
      <rect x="200" y="92" width="62" height="108" fill={`url(#${lit})`} />
      <rect x="270" y="58" width="92" height="142" fill={`url(#${lit})`} />
      <path d="M0 198h400" stroke="#1B1B1A" strokeWidth="4" />
    </svg>
  )
}

function Dinner() {
  const plates: [number, number][] = [
    [200, 48],
    [200, 152],
    [148, 100],
    [252, 100],
  ]
  const glasses: [number, number][] = [
    [176, 72],
    [224, 72],
    [176, 128],
    [224, 128],
  ]
  return (
    <svg {...svgProps}>
      <rect width="400" height="200" fill="#1E3FB8" />
      <circle cx="200" cy="100" r="82" fill="#F5F5F1" stroke="#1B1B1A" strokeWidth="3" />
      <g stroke="#1B1B1A" strokeWidth="3">
        {plates.map(([cx, cy]) => (
          <circle key={`p${cx}-${cy}`} cx={cx} cy={cy} r="17" fill="#FFEE9A" />
        ))}
        <circle cx="200" cy="100" r="15" fill="#B8231D" />
        {glasses.map(([cx, cy]) => (
          <circle key={`g${cx}-${cy}`} cx={cx} cy={cy} r="6" fill="#DCE3FF" />
        ))}
      </g>
      <g fill="#F5F5F1" stroke="#1B1B1A" strokeWidth="2">
        {plates.map(([cx, cy]) => (
          <circle key={`c${cx}-${cy}`} cx={cx} cy={cy} r="7" />
        ))}
      </g>
    </svg>
  )
}

function Trip() {
  return (
    <svg {...svgProps}>
      <rect width="400" height="200" fill="#DCE3FF" />
      <circle cx="70" cy="150" r="70" fill="#FFEE9A" opacity=".8" />
      <path
        d="M52 150Q190 -10 340 118"
        fill="none"
        stroke="#1B1B1A"
        strokeWidth="4"
        strokeDasharray="4 10"
        strokeLinecap="round"
      />
      <circle cx="52" cy="150" r="12" fill="#1E3FB8" stroke="#1B1B1A" strokeWidth="3" />
      <path
        d="M340 118c-14-18-24-30-24-44a24 24 0 0 1 48 0c0 14-10 26-24 44z"
        fill="#B8231D"
        stroke="#1B1B1A"
        strokeWidth="3"
      />
      <circle cx="340" cy="74" r="8" fill="#F5F5F1" />
    </svg>
  )
}

function Plain() {
  return (
    <svg {...svgProps}>
      <rect width="400" height="200" fill="#F5F5F1" />
      <g stroke="#1B1B1A" strokeWidth="1.5" opacity=".7">
        <path d="M0 30h400M0 60h400M0 90h400M0 120h400M0 150h400M0 180h400" />
      </g>
      <path d="M56 0v200" stroke="#B8231D" strokeWidth="2.5" />
      <path
        d="M92 74l16 16 40-48"
        fill="none"
        stroke="#1E3FB8"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
