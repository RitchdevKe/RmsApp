import React from 'react';
import { EmptyState } from './ui/primitives';

/**
 * Placeholder content for Partial sub-modules whose full UI ships
 * in a later slice. Keeps the navigation honest while we build out
 * the rest of the modules.
 */
export const ComingSoon: React.FC<{ title: string; description?: string; icon?: string }> = ({
  title, description, icon = 'star',
}) => (
  <div className="py-6">
    <EmptyState
      icon={icon}
      title={`${title} — coming up`}
      description={description || 'This module is part of the upgraded Partial portal and lands in the next release slice.'}
    />
  </div>
);
