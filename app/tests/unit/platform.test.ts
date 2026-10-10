import { describe, expect, it } from 'vitest';
import { isIOS, shouldShowInstallGuide } from '../../src/ui/platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36';

describe('plataforma', () => {
  it('reconhece iPhone e iPad (Mac com toque)', () => {
    expect(isIOS(IPHONE, 5)).toBe(true);
    expect(isIOS(MAC, 5)).toBe(true);
    expect(isIOS(MAC, 0)).toBe(false);
    expect(isIOS(ANDROID, 5)).toBe(false);
  });
  it('guia de instalação só no iOS fora do app instalado e não dispensado', () => {
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe(true);
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: true, dismissed: false })).toBe(false);
    expect(shouldShowInstallGuide({ ua: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: true })).toBe(false);
    expect(shouldShowInstallGuide({ ua: ANDROID, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe(false);
  });
});
