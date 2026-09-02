'use client';
import QRCode from 'qrcode.react';

export default function QRCodeComponent({ value, size = 200 }: { value: string; size?: number }) {
  return <QRCode value={value} size={size} level="H" includeMargin={false} />;
}