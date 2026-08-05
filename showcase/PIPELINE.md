# Showcase point-cloud pipeline queue

Compiled 2026-07-22 from a full sweep of OneDrive EBIC_Work, \\adam\DataPool
(X:), and \\403Edge\Public (Z:); revised 2026-07-23 with export findings.

Selection rules applied:

- Revit: newest non-backup central per project; where a folder mixes
  consultant/design-firm models with EBIC trade models, ONLY the EBIC
  trade model is featured (standing rule).
- SolidWorks: .sldasm only, max one finalized whole-thing assembly per
  project folder -- the LARGEST complete assembly. All SW content lives
  under Design Work (X: and Z: copies of the same tree); zero SW anywhere
  in EBICArchive or OneDrive.
- X:\EBICArchive and Z:\EBICArchive largely mirror each other; paths
  below prefer X:.

## Do the export through the owning claw

Per the fleet domain-specialist doctrine: **Revit exports go to auto-claw,
SolidWorks exports go to solid-claw.** Hand over the WHAT (model, scope,
output format, return contract) and let the specialist own the HOW. Both
claws already carry hard-won harness knowledge -- the Revit bridge's
Home-screen guard, per-instance routing, dialog handling, CodeDom quirks
-- that costs hours to rediscover from outside. Doing it DIY here crashed
a Revit instance on 2026-07-23.

Bake command (once a GLB/OBJ export exists):

    python scripts/decimate-pointcloud.py <export.glb> assets/clouds/<slug>.json \
        --name "<Label>" --drop "site,topo,grass,planting"

## Baked and live

| Slug | Source | Notes |
|---|---|---|
| homeaddition | assets/models/HomeAddition.glb | first colored cloud; site meshes dropped |
| lunarrover | Earthrise Space lunar rover | 342 components, no suppression in any config |
| speakerbox | speaker box, largest root assembly | |

## Queue: Revit -- website-eligible

| Priority | Model | Path | MB | Why |
|---|---|---|---|---|
| 1 | CEP Mule structural steel As-Built | X:\EBICArchive\Dixie Metal Products - CEP-EPG\CEP_Mule_StrucSteel_As-Built.rvt | 431 | Finalized as-built; dense steel frame = striking particle form. Revit 2018, opens in the running 2023. |
| 2 | Bahamas Residence coordination | X:\EBICArchive\4D Archive\Bahamas-Residence\Rumpf for 3D Coordination Model.rvt | 52 | Clean whole residence. Revit 2019. |
| 3 | TIA Airside D roofing | X:\Projects\2026-005_TIA_Airside_D_Roofing_ASM\ASD_ROOF_ASM.rvt | 133 | EBIC trade model of the terminal roof form. Revit 2026 -- needs Revit 2026. |
| 4 | OIA STC interior drywall+framing | X:\EBICArchive\SimBot\Estimate Files\OIA STC ASC Interior Drywall & Framing\WS112_STC_ASC_Interior Drywall+Framing.rvt | 554 | Largest trade-scope terminal model. |

## Queue: Revit -- DEMO ONLY, never published

Jordan, 2026-07-23: "you can do the exterior of the airports, for the
demo, but we can't use them in the website." Bake these into the
git-ignored `assets/clouds/local/` only. They must never be committed.

| Model | Path | MB | Notes |
|---|---|---|---|
| Saipan airport | X:\Projects\2025-002_Saipan\saipan airport.rvt | 152 | Revit 2024. Workshared central copy: throws "Copied Central Model" then "Cannot Find Central Model" dialogs that block the bridge until dismissed. |
| Rota airport | X:\Projects\2025-001_Rota\rotaShiftback.rvt | 134 | Revit 2024. |
| Tinian airport | X:\Projects\2025-003_Tinian\tinian airport.rvt | 145 | Revit 2024. |

## Queue: SolidWorks

| Priority | Assembly | Path | Why |
|---|---|---|---|
| 1 | Polywell | X:\Design Work\Polywell\Assem4.SLDASM | Fusion-device geometry; unique non-building form |
| 2 | Car Project | X:\Design Work\Car Project\Fiberglass Assembly.SLDASM | Clean standalone object |
| 3 | EM Car Audio bench | X:\Design Work\EM Car Audio System Project\Bench Assembly.SLDASM | Top-level of the audio system project |

## Dropped from the queue

- **50m Yacht Revit model** (Z:\EBICArchive\4D Archive\50mYacht - PatH\
  50mYacht-CCG.rvt, 5.7 MB). Opened and censused 2026-07-23: 3,668
  elements but only **3 floors carry solids**; the remaining 2,927 are
  uncategorized settings/types. There is no yacht geometry in this file
  -- the hull must live in a link or imported CAD. Not a usable source.

## Excluded by rule

Consultant/design-firm centrals in trade folders (HNTB/Arup/EYP/DPA/NASH
models up to 1.9 GB), numbered .NNNN backups, _detached/-DESKTOP-/LOCAL
copies, .rfa families, Revit Full Library.rvt, Kawneer manufacturer
downloads, and the boatscan e57 (incomplete scan, retired 2026-07-22).
