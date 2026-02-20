import { Briefcase } from 'lucide-react';
import type { FeatureModule } from '@career-copilot/core';
import { JobsRoute } from './routes';

const jobsFeature: FeatureModule = {
  navItem: {
    label: 'Job Feed',
    path: '/jobs',
    icon: Briefcase,
  },
  routes: [
    {
      path: '/jobs',
      element: <JobsRoute />,
    },
  ],
};

export default jobsFeature;
