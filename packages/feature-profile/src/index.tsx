import { User } from 'lucide-react';
import type { FeatureModule } from '@career-copilot/core';
import { ProfileRoute } from './routes';

const profileFeature: FeatureModule = {
  navItem: { label: 'Profile', path: '/profile', icon: User },
  routes: [{ path: '/profile', element: <ProfileRoute /> }],
};

export default profileFeature;
