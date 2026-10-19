// In a browser (development and tests) there are no rest notifications; the
// timer itself still runs. See restAlert.ts for the phone.
export async function scheduleRestAlert(_end: number, _title: string, _body: string) {}
export async function cancelRestAlert() {}
