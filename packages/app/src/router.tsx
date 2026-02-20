import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@career-copilot/ui';
import { FeatureRegistry } from './registry/FeatureRegistry';

import profileFeature from '@career-copilot/feature-profile';
import jobsFeature from '@career-copilot/feature-jobs';
import resumeStudioFeature from '@career-copilot/feature-resume-studio';
import applicationsFeature from '@career-copilot/feature-applications';
import interviewsFeature from '@career-copilot/feature-interviews';
import insightsFeature from '@career-copilot/feature-insights';
import settingsFeature from '@career-copilot/feature-settings';

const registry = new FeatureRegistry()
  .register(jobsFeature)
  .register(applicationsFeature)
  .register(resumeStudioFeature)
  .register(interviewsFeature)
  .register(insightsFeature)
  .register(profileFeature)
  .register(settingsFeature);

const navItems = registry.getNavItems();

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell navItems={navItems} />,
    children: [
      { index: true, element: <Navigate to="/jobs" replace /> },
      ...registry.getRoutes(),
    ],
  },
]);
