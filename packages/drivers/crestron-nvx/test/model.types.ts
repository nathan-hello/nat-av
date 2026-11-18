import { forNvxModel, type NvxDriver } from "../index.js";

async function check(driver: NvxDriver) {
  const plain = await forNvxModel(driver, "DM-NVX-360");
  plain.setAudioSource("Input1");
  // @ts-expect-error: single HDMI input on the 36x family
  plain.setAudioSource("Input2");
  // @ts-expect-error: native Dante is not present on a 360
  plain.dante.setName("Port1", "Desk");
  const dante = await forNvxModel(driver, "DM-NVX-363");
  dante.dante.setName("Port1", "Desk");
}
