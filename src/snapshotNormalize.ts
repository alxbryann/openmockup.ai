import type { ProjectSnapshot } from './projectStore'

/** Prepare snapshot for DB persistence — strip transient blob URLs but keep storage paths. */
export function normalizeSnapshotForSave(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    devices: snapshot.devices.map((d) => {
      const hasPersistedVideo = d.screenMediaKind === 'video' && d.screenMediaStoragePath
      if (hasPersistedVideo) {
        return {
          ...d,
          screenshot: null,
          screenMediaKind: 'video' as const,
          videoUploadInFlight: undefined,
          screenLoadError: null,
        }
      }
      if (d.screenMediaKind === 'video' && d.screenshot?.startsWith('blob:')) {
        return {
          ...d,
          screenshot: null,
          screenMediaKind: null,
          screenMediaStoragePath: null,
          videoUploadInFlight: undefined,
        }
      }
      return {
        ...d,
        videoUploadInFlight: undefined,
      }
    }),
  }
}
