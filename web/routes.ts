import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('signin', 'routes/signin.tsx'),
  route('assets/report', 'routes/report.tsx'),
  route('asset', 'routes/asset.tsx'),
  route('groups', 'routes/groups.tsx'),
  route('profile', 'routes/profile.tsx'),
  route('administration/members', 'routes/members.tsx'),
  route('administration', 'routes/administration.tsx'),
] satisfies RouteConfig;
