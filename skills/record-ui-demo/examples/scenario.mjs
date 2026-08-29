export const meta = {
  slug: 'example-sign-in',
  title: { pl: 'Logowanie', en: 'Sign in' },
  subtitle: {
    pl: 'Żółta ramka pokazuje, gdzie kliknąć. Biała strzałka to kursor myszy.',
    en: 'Yellow outline shows the target. White arrow is the mouse.',
  },
};

export async function run({ page, appUrl, speak, humanClick, humanType, pointerTo }) {
  await speak('Zaczynamy od ekranu logowania.');
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await pointerTo(200, 200);
  await humanClick(page.getByLabel('Login'), '1. Pole: Login');
  await humanType(page.getByLabel('Login'), 'admin');
}
