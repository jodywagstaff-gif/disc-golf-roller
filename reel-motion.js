// The motion itself determines the result. There is no independent random pick.
export const SPIN_DURATION = 3800;
export const SETTLE_DURATION = 550;
export function spinPlan(start,ordinal=0){return {start:Math.round(start),steps:20+(ordinal%7),duration:SPIN_DURATION};}
export function spinPosition(plan,elapsed){const t=Math.max(0,Math.min(1,elapsed/plan.duration));return plan.start+plan.steps*(1-(1-t)**3);}
export function centeredIndex(position,length){if(!Number.isFinite(position)||!Number.isInteger(length)||length<1)throw new Error('Invalid reel geometry');return ((Math.round(position)%length)+length)%length;}
