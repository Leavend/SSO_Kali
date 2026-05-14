export type LocationPort = Pick<Location, 'assign' | 'origin'>

let locationOverride: LocationPort | null = null

export function getLocationPort(): LocationPort {
  return locationOverride ?? window.location
}

export function setLocationPortForTest(locationPort: LocationPort | null): void {
  locationOverride = locationPort
}
