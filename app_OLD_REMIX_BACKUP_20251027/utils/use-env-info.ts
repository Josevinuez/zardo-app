import { loader as rootLoader } from '../root'
import { useRouteLoaderData } from '@remix-run/react'

/**
 * Returns the env info from the Root loader.
 */
export function useEnvInfo() {
  const data = useRouteLoaderData<typeof rootLoader>('root')
  if (!data?.env) throw new Error('No env info found in Root loader.')

  return data.env
}