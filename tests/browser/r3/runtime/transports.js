'use client';
// Actual application handlers can run; provider SDK/transport cannot.
export function capture(event,props){(window.__r3Captures??=[]).push({event,props});}
export function track(event,props){(window.__r3Vercel??=[]).push({event,props});}
export function initAnalytics(){}
export function setCommonContext(){}
export function Analytics(){return null;}
export function SpeedInsights(){return null;}
export default function FixtureTransport(){return null;}
