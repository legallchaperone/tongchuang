import React from "react";
import { PxIcon } from "./Pixel";

export const IToday = () => <PxIcon name="today" />;
export const IRoom = () => <PxIcon name="room" />;
export const IStats = () => <PxIcon name="stats" />;
export const ISettings = () => <PxIcon name="settings" />;
export const IPlay = () => <PxIcon name="play" />;
export const IPause = () => <PxIcon name="pause" />;
export const IStop = () => <PxIcon name="stop" />;
export const IHand = () => <PxIcon name="hand" />;
export const IUsers = () => <PxIcon name="users" />;
export const IPlus = () => <PxIcon name="plus" size={14} />;
export const IClose = () => <PxIcon name="close" size={14} />;
export const ICopy = () => <PxIcon name="copy" />;
export const IBack = () => <PxIcon name="back" size={14} />;
export const ISound = () => <PxIcon name="sound" />;
export const IExpand = () => <PxIcon name="expand" size={14} />;
export const IFlame = () => <PxIcon name="flame" />;
export const ITrash = () => <PxIcon name="trash" size={14} />;
export const IBook = () => <PxIcon name="book" />;

/** pixel desk lamp */
const LOGO = [
  "..........",
  "..#####...",
  ".#######..",
  "..L...L...",
  "...LLL....",
  ".....#....",
  ".....#....",
  ".....#....",
  "...#####..",
  "..........",
];
export const Logo = () => (
  <svg viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true" className="logo-mark">
    <rect x="0" y="0" width="10" height="10" fill="var(--wood-dk)" />
    {LOGO.flatMap((r, y) => [...r].map((c, x) => c === "#" ? <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="#5fae7e" /> : c === "L" ? <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="#ffe680" /> : null))}
  </svg>
);
