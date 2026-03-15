import {
  BookMinimalistic,
  Box,
  ChartSquare,
  Dumbbell,
  GraphUp,
  History,
  Home,
  Settings,
  User,
  Widget,
} from '@solar-icons/react';
import type { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '@/shared/hooks/use-translation';

type ShellRouteId =
  | 'home'
  | 'history'
  | 'stats'
  | 'training'
  | 'tutorial'
  | 'friends'
  | 'leaderboard'
  | 'cube3d'
  | 'settings';

type ShellSectionId = 'core' | 'learn' | 'community' | 'workspace';

type ShellSheetId = 'learn' | 'more';

type ShellIcon = ComponentType<{ size?: number; className?: string }>;

interface ShellRouteDefinition {
  id: ShellRouteId;
  href: string;
  exact?: boolean;
  icon: ShellIcon;
  sectionId: ShellSectionId;
}

interface ShellSectionDefinition {
  id: ShellSectionId;
  routeIds: ShellRouteId[];
}

interface ShellRouteItem extends ShellRouteDefinition {
  description: string;
  isActive: boolean;
  label: string;
}

interface ShellSection {
  id: ShellSectionId;
  label: string;
  items: ShellRouteItem[];
}

interface ShellSheetItem {
  id: ShellSheetId;
  icon: ShellIcon;
  isActive: boolean;
  label: string;
}

const ROUTE_DEFINITIONS: ShellRouteDefinition[] = [
  { id: 'home', href: '/', exact: true, icon: Home, sectionId: 'core' },
  { id: 'history', href: '/history', icon: History, sectionId: 'core' },
  { id: 'stats', href: '/stats', icon: GraphUp, sectionId: 'core' },
  { id: 'training', href: '/training', icon: Dumbbell, sectionId: 'learn' },
  { id: 'tutorial', href: '/tutorial', icon: BookMinimalistic, sectionId: 'learn' },
  { id: 'friends', href: '/friends', icon: User, sectionId: 'community' },
  { id: 'leaderboard', href: '/leaderboard', icon: ChartSquare, sectionId: 'community' },
  { id: 'cube3d', href: '/cube-3d', icon: Box, sectionId: 'workspace' },
  { id: 'settings', href: '/settings', icon: Settings, sectionId: 'workspace' },
];

const SECTION_DEFINITIONS: ShellSectionDefinition[] = [
  { id: 'core', routeIds: ['home', 'history', 'stats'] },
  { id: 'learn', routeIds: ['training', 'tutorial'] },
  { id: 'community', routeIds: ['friends', 'leaderboard'] },
  { id: 'workspace', routeIds: ['cube3d', 'settings'] },
];

const PRIMARY_ROUTE_IDS: ShellRouteId[] = ['home', 'history', 'stats'];
const LEARN_ROUTE_IDS: ShellRouteId[] = ['training', 'tutorial'];
const MORE_SECTION_IDS: ShellSectionId[] = ['community', 'workspace'];

function isRouteActive(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useShellNavigation() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const labels: Record<ShellRouteId, string> = {
    home: t.navigation.home,
    history: t.navigation.history,
    stats: t.navigation.stats,
    training: t.navigation.training,
    tutorial: t.navigation.tutorial,
    friends: t.navigation.friends,
    leaderboard: t.navigation.leaderboard,
    cube3d: t.navigation.cube3d,
    settings: t.navigation.settings,
  };

  const descriptions: Record<ShellRouteId, string> = {
    home: t.pages.home.description,
    history: t.pages.history.description,
    stats: t.pages.stats.description,
    training: t.pages.training.description,
    tutorial: t.pages.tutorial.description,
    friends: t.pages.friends.description,
    leaderboard: t.pages.leaderboard.description,
    cube3d: t.pages.cube3d.description,
    settings: t.pages.settings.description,
  };

  const sectionLabels: Record<ShellSectionId, string> = {
    core: t.navigation.groups.core,
    learn: t.navigation.groups.learn,
    community: t.navigation.groups.community,
    workspace: t.navigation.groups.workspace,
  };

  const routeItems = ROUTE_DEFINITIONS.map<ShellRouteItem>((definition) => ({
    ...definition,
    description: descriptions[definition.id],
    isActive: isRouteActive(pathname, definition.href, definition.exact),
    label: labels[definition.id],
  }));

  const routeById = new Map(routeItems.map((item) => [item.id, item]));

  const sections = SECTION_DEFINITIONS.map<ShellSection>((definition) => ({
    id: definition.id,
    label: sectionLabels[definition.id],
    items: definition.routeIds
      .map((routeId) => routeById.get(routeId))
      .filter((item): item is ShellRouteItem => item !== undefined),
  }));

  const primaryItems = PRIMARY_ROUTE_IDS.map((routeId) => routeById.get(routeId)).filter(
    (item): item is ShellRouteItem => item !== undefined,
  );

  const learnItems = LEARN_ROUTE_IDS.map((routeId) => routeById.get(routeId)).filter(
    (item): item is ShellRouteItem => item !== undefined,
  );

  const moreSections = MORE_SECTION_IDS.map((sectionId) => sections.find((section) => section.id === sectionId)).filter(
    (section): section is ShellSection => section !== undefined,
  );

  const activeRoute = routeItems.find((item) => item.isActive) ?? routeItems[0];
  const activeSection = sections.find((section) => section.items.some((item) => item.isActive)) ?? sections[0];

  const sheetItems: ShellSheetItem[] = [
    {
      id: 'learn',
      icon: BookMinimalistic,
      isActive: learnItems.some((item) => item.isActive),
      label: t.navigation.learn,
    },
    {
      id: 'more',
      icon: Widget,
      isActive: moreSections.some((section) => section.items.some((item) => item.isActive)),
      label: t.navigation.more,
    },
  ];

  return {
    activeRoute,
    activeSection,
    learnItems,
    moreSections,
    primaryItems,
    sections,
    sheetItems,
    sheetDescriptions: {
      learn: t.navigation.sheet.learnDescription,
      more: t.navigation.sheet.moreDescription,
    },
  };
}
