/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import * as Icons from 'lucide-react';

interface IconRendererProps {
  name: string;
  className?: string;
  size?: number;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ name, className = '', size = 20 }) => {
  // Safe lookup with typing
  const LucideIcon = (Icons as any)[name];
  
  if (!LucideIcon) {
    // Fallback to a generic Home icon if not found
    return <Icons.Home className={className} size={size} />;
  }
  
  return <LucideIcon className={className} size={size} />;
};
