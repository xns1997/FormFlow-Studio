import React from 'react';
import type { RangeRef } from '../models';
import { rangeToAddress } from '../services/data/rangeResolver';

interface RangeTagProps {
  range: RangeRef | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function RangeTag({ range, onConnect, onDisconnect }: RangeTagProps) {
  if (!range) {
    return (
      <button className="lg-range-connect" onClick={onConnect}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        连接数据源
      </button>
    );
  }

  const address = rangeToAddress(range);

  return (
    <div className="lg-range-tag">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1.5 4.5L4.5 1.5L7.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.5 1.5V8.5C4.5 9.5 5 10.5 6 10.5H9C9.5 10.5 10 10 10 9.5V7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="lg-range-address">{address}</span>
      <button className="lg-range-disconnect" onClick={onDisconnect} title="断开连接">×</button>
    </div>
  );
}
