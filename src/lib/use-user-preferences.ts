import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useTheme, type Theme } from '@/contexts/theme-context';
import { useLocale } from '@/i18n';
import { usersApi, type SettingsPatch, type UserSettings } from '@/lib/api';

const KEY = ['me', 'settings'] as const;

// Theme/locale live in providers (localStorage, instant) and on the server (follows the user across devices);
// every writer must go through `update` or the two drift.
export function useUserPreferences() {
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const { setLocale } = useLocale();

  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => usersApi.settings(signal),
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: SettingsPatch) => usersApi.updateSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<{ settings: UserSettings }>(KEY);
      if (previous) {
        queryClient.setQueryData(KEY, { settings: { ...previous.settings, ...patch } });
      }
      if (patch.theme) setTheme(patch.theme as Theme);
      if (patch.locale === 'de' || patch.locale === 'en') setLocale(patch.locale);
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(KEY, ctx.previous);
    },
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(KEY, { settings });
    },
  });

  return {
    query,
    settings: query.data?.settings,
    update: mutation.mutate,
    mutation,
  };
}

// Mount once in the app shell.
export function useApplySavedPreferences() {
  const { settings } = useUserPreferences();
  const { setTheme } = useTheme();
  const { setLocale } = useLocale();
  const applied = useRef(false);

  useEffect(() => {
    if (!settings || applied.current) return;
    applied.current = true;
    if (settings.theme) setTheme(settings.theme as Theme);
    if (settings.locale === 'de' || settings.locale === 'en') setLocale(settings.locale);
  }, [settings, setTheme, setLocale]);
}
