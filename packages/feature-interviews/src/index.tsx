import { MessageSquare } from 'lucide-react';
import type { FeatureModule } from '@career-copilot/core';
import { InterviewsRoute } from './routes';

const interviewsFeature: FeatureModule = {
  navItem: { label: 'Interviews', path: '/interviews', icon: MessageSquare },
  routes: [{ path: '/interviews', element: <InterviewsRoute /> }],
};

export default interviewsFeature;
