"""Generate DM NVX model profiles from the pinned Crestron SDK compiler XML.

`pnpm run setup` restores Crestron.SimplSharp.SDK.ProgramLibrary into
sdk/packages/. This script reads only that XML (SimplSharpPro.xml and
Crestron.SimplSharpPro.DM.xml) and never touches the network.

A profile records what the SDK documentation says a model *can* do: its
families, HDMI/USB-C input counts, audio sources, Dante support, and the
SDK members whose support differs between NVX models ("features"). Runtime
discovery then checks what the connected device actually reports.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[1]
package = "Crestron.SimplSharp.SDK.ProgramLibrary"
reference = next(r for r in ET.parse(root / "sdk/CrestronSdk.csproj").iter("PackageReference")
                 if r.get("Include") == package)
version = reference.get("Version")
lib = root / "sdk/packages" / package.lower() / version / "lib/net6.0"
if not lib.is_dir():
    sys.exit(f"Missing {lib}. Run `pnpm run setup` from the workspace root first.")

ns = "Crestron.SimplSharpPro.DM.Streaming."
members = {}
for assembly in ("Crestron.SimplSharpPro.DM", "SimplSharpPro"):
    for element in ET.parse(lib / (assembly + ".xml")).findall("./members/member"):
        members.setdefault(element.attrib["name"], element)


def summary(name):
    element = members.get(name)
    node = element.find("summary") if element is not None else None
    if node is None:
        return "", []
    return " ".join("".join(node.itertext()).split()), [s.get("cref", "") for s in node.iter("see")]


def canonical(token):
    """DmNvx363C / DM-NVX-363c / !:DmNvx363C -> DM-NVX-363C."""
    match = re.search(r"(?:DmNvx|DM-NVX-)([0-9A-Za-z]+)", token)
    return "DM-NVX-" + match.group(1).upper() if match else None


# Concrete 3xx models: SDK types named DmNvx<3 digits><optional C>.
models = sorted(canonical(name) for name in members
                if re.fullmatch(r"T:" + re.escape(ns) + r"DmNvx3\d\dC?", name))
if not models:
    sys.exit("The SDK XML documents no DM-NVX-3xx models.")


def symbol(model):
    return "DmNvx" + model.removeprefix("DM-NVX-")


# Families: DmNvx36x documents 360/363 by name; "Base class for the ... devices"
# crefs add classes such as DmNvx38xDsp that do not follow the naming pattern.
families = {model: [] for model in models}
for name in members:
    match = re.fullmatch(r"T:" + re.escape(ns) + r"(DmNvx3\dx\w*)", name)
    if not match:
        continue
    family = match.group(1)
    text, refs = summary(name)
    listed = {canonical(ref) for ref in refs if "DmNvx3" in ref} if text.startswith("Base class") else set()
    for model in models:
        if model in listed or re.fullmatch(family[:-1] + r"\w+", symbol(model)) and family.endswith("x"):
            families[model].append(family)


def mentioned(text, refs):
    """Models and model families named by a support statement."""
    tokens = {canonical(ref) for ref in refs} | {canonical(t) for t in
                                                 re.findall(r"(?:DmNvx|DM-NVX-)[0-9A-Za-z]+", text)}
    tokens.discard(None)
    found = set()
    for token in tokens:
        suffix = token.removeprefix("DM-NVX-")
        # DM-NVX-36x / 36X(C) is a family wildcard; 384X names the 384 family.
        if re.fullmatch(r"3\dX", suffix):
            found |= {m for m in models if m.startswith(token[:-1])}
        elif re.fullmatch(r"3\d\dX", suffix):
            found |= {m for m in models if m.startswith(token[:-1])}
        elif token in models:
            found.add(token)
    return found


def supported(name, model):
    """Apply 'not supported by' / 'supported only for' statements."""
    text, refs = summary(name)
    names = mentioned(text, refs)
    if re.search(r"not supported by", text, re.I):
        return model not in names
    if re.search(r"supported (?:only )?(?:by|for)|only supported by", text, re.I) and names:
        return model in names
    return True


def declared(model):
    """Properties on the model's SDK class chain, including DmNvxControl sigs."""
    owners = ["DmNvxBaseClass", *families[model], symbol(model)]
    found = {}
    for owner in owners:
        prefix = "P:" + ns + owner + "."
        for name in members:
            if name.startswith(prefix) and name.count(".") == prefix.count("."):
                found[name[len(prefix):]] = name
    prefix = "P:" + ns + "DmNvxControl."
    for name in members:
        if name.startswith(prefix):
            found[name[len(prefix):]] = name
    return {member: name for member, name in found.items()
            if not member.endswith(("Feedback", "Feeback")) and member not in ("Parent", "UserSpecifiedObject")}


available = {model: {m for m, name in declared(model).items() if supported(name, model)} for model in models}
everywhere = set.intersection(*available.values())

# Reviewed subset of DeviceSpecific.AudioSource wire values. Feedback-only
# constants and SDK names without a documented REST spelling are excluded.
wire = ("AudioFollowsVideo", "Input1", "Input2", "AnalogAudio", "PrimaryStreamAudio", "SecondaryStreamAudio")
profiles = {}
for model in models:
    text, _ = summary("T:" + ns + symbol(model))
    sources = [value for value in wire
               if supported("F:" + ns + "DmNvxControl.eAudioSource." + value, model)]

    def count(port):
        match = re.search(r"(\d+|Single|Dual) " + port + r" inputs?", text, re.I)
        return None if not match else {"single": 1, "dual": 2}.get(match.group(1).lower(), None) or int(match.group(1))

    profiles[model] = {
        "families": families[model],
        "hdmiInputs": count("HDMI") or (2 if "Input2" in sources else 1),
        "usbCInputs": count("USB-C") or 0,
        "audioSources": sources,
        "dante": "DanteAudioSource" in available[model] or bool(re.search(r"\bDante\b", text)),
        "features": sorted(available[model] - everywhere, key=str.lower),
    }

dest = root / "client/generated.ts"
dest.write_text("// Generated by scripts/generate.py from Crestron SDK " + version + " compiler XML.\n"
                + "export const profiles = " + json.dumps(profiles, indent=2) + " as const;\n")
print(f"Wrote {len(profiles)} model profiles to {dest.relative_to(root)}.")
