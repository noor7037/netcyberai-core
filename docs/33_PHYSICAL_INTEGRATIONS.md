# 33 — Physical integrations: assessed, not planned

**Status:** assessment (C230-I, 2026-10-20). Nothing here is planned or built. The repository has no device
integration today. The ideas came from the founder's earlier product discussions and are kept here so they are not
lost, without turning the Family App plan into a hardware catalogue.

## 1. How an idea moves from here to the roadmap

An idea enters the roadmap only when all four hold:
1. **A pilot school asks for it,** naming the workflow it fixes.
2. **The workflow is measurable** before and after (minutes saved, incidents caught, records kept).
3. **A hardware partner** installs and maintains it. NetCyberAI does not run field service.
4. **It plugs into what exists:** the phone camera, the jobs runner, and later the Automation OS's events. It never gets
   a parallel architecture of its own.

## 2. Assessment

| Idea | School need | Reliability, installation, upkeep | Fits what exists | Verdict |
|---|---|---|---|---|
| **QR labels** on learning resources and assets | Find the right worksheet or topic; identify an asset | Printed labels; phones read them; nothing to install | QR already used for ID cards and certificate verification (C228). A QR on a worksheet or book can open its topic in the family app's Understand (`family-app/02` §13). | **Near term, software only:** when a resource or asset register exists |
| **Phone-camera barcode scanning** for library and stock | Issue and return books; count stock | The phone's camera; no scanner to buy | No library or inventory module exists yet | **With a library or inventory module,** if a pilot school asks |
| Teacher capture kit (phone stand, light) | Better photos of boards and worksheets | Cheap accessories; no software | The capture OCR exists (Prompt F) | **Guidance only:** a help article, no product work |
| Digital water-testing records | Records for inspections | Forms; the tests are done by people | Fits the compliance desk's evidence | **Possible software slice** (a record form) if a school asks |
| Curriculum-linked STEM kits | Hands-on science | Physical supply chain | Could link to Understand topics by QR | **Partnership only;** no product work until a partner exists |
| School network-availability monitor | Know when the internet is down | A device per school; false alarms; power | No device events yet | **Deferred** |
| Water-tank level and leak sensors | Waste, damage | Sensors, power, connectivity, calibration | No device events yet | **Deferred** |
| Classroom environment sensors (CO₂, temperature, noise) | Comfort, health | Calibration drift; privacy questions on noise | No device events yet | **Deferred** |
| Energy monitoring | Bills | Electrician install; vendor lock-in | No device events yet | **Deferred** |

## 3. When a device idea is taken up

- One generic, audited path: a device posts signed events to a single endpoint per school; events land as rows the
  Automation OS (`16` §4, the automation plan) can act on; the school sees them in its own module.
- No device talks to the family app.
- Each device type is a partner integration with a written support model and a measured outcome before it is offered to
  a second school.
