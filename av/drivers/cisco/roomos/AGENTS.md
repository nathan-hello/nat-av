# Cisco RoomOS Driver for the Natav Framework

The purpose of this folder is to provide a Typescript API for the Cisco RoomOS
API.

Cisco RoomOS produces a JSON document for all of the xCommand, xConfiguration,
xFeedback, and xStatus command you can give to the device, what each command's
arguments are, their bounds, and the returned structure.

We want a typesafe API that is derived from this JSON structure. There are
multiple ways to send the command over a socket, such as the Terminal mode,
XML, JSONRPC, or HTTP. After the user of this library creates a RoomOSWriter
they will receive an object that is the typesafe api.

This will be a proxy object that builds the Terminal, XML, JSONRPC, or HTTP
request programatically. All the RoomOSWriter object needs to do is implement
the interface.

Your goal is to use commands like `jq` and `grep` to go through the schema and
understand how to parse it to generate a typesafe API from it. For example, a 
command like this

```json
"attributes": {
  "access": "public-api",
  "backend": "any",
  "description": "If AirPlay is enabled, you can use the AirPlay KeyEvent commands to control audio and video playback, and to navigate the AirPlay menus (AirPlay Remote Control) on the video device. Refer to the Video Input AirPlay Mode setting on how to enable AirPlay. Use this command to navigate back.",
  "params": [],
  "privacyimpact": "False",
  "read": [],
  "role": ["Admin", "User"]
},
"id": 20462,
"normPath": "AirPlay KeyEvent Back",
"path": "AirPlay KeyEvent Back",
"products": [
  "bandai",
  "barents",
  "barents_70d",
  "barents_70i",
  "barents_70s",
  "barents_82i",
  "brooklyn",
  "darling_10_55",
  "darling_10_70",
  "darling_15_55",
  "darling_15_70",
  "darling_15_85",
  "davinci",
  "felix_55",
  "felix_75",
  "havella",
  "helix_55",
  "helix_75",
  "hopen",
  "millennium",
  "octavio",
  "polaris",
  "spitsbergen",
  "svea",
  "svea_55d",
  "svea_70d",
  "svea_70s"
],
"type": "Command"
```

The `Path` is extremely relevant here. The caller will do something like

`await roomos.xCommand.AirPlay.KeyEvent.Back()`

Because this function takes no arguments and returns nothing, we don't have to
do anything special. However in the typed helper there should be a docstring on
the typescript type like

```ts
type xCommandReturnDefault = null;

namespace xCommand  {

export namespace Return {
    export namespace Airplay {
        export namespace KeyEvent {
            type Back = xCommandReturnDefault: 
        }
    }    
}

type Api = {
AirPlay: {
    KeyEvent {
      /**
      * Description: If AirPlay is enabled, you can use the AirPlay KeyEvent commands to control audio and video playback, and to navigate the AirPlay menus (AirPlay Remote Control) on the video device. Refer to the Video Input AirPlay Mode setting on how to enable AirPlay. Use this command to navigate back.
      * Roles: ["Admin", "User"]
      * Access: "public-api"
      * Backend: "any"
      */
      Back: () => Promise<Return.Airplay.KeyEvent.Back> 
    }
}
}
}
```

And then the Proxy object will build the actual Terminal, XML, JSONRPC, or HTTP request via the writer and deal with the promises.

The only thing we care about is getting 100% accurate function arguments and return types. 

Entries of `type: "Command"` don't tell you what the return type is. That's okay, just make the tree anyways and we will override it later. 

The nested `namespace` is because we want to access the types in the same way as the Api. We don't want to inline it because then we can't
have a docstring. 


```json
{
  "attributes": {
    "access": "public-api",
    "backend": "any",
    "description": "Attach an input connector to the local input given by the input ID. You must specify both the connector's type and number (ConnectorType, ConnectorId) to uniquely identify the connector. A connector can only be attached to one local input. Run xStatus Audio Input LocalInput to get an overview of all local inputs. This command is used by the Audio Console. If you don't use Audio Console, note that you must create a macro to make the audio chain definitions persistent over a reboot. Codec EQ: AVIntegrator option required.",
    "params": [
      {
        "description": "Select a connector. The connectors' numbers are printed on the codec connector panel.",
        "name": "ConnectorId",
        "required": true,
        "valuespace": {
          "Max": "8",
          "Min": "1",
          "Step": "1",
          "type": "Integer"
        }
      },
      {
        "description": "Select the type of the physical connector, device, or session to receive audio from. AirPlay: An active AirPlay session. Ethernet: An audio device (Cisco Table Microphone Pro / Cisco Microphone Array) on the codec's internal network. HDMI: An HDMI input. Microphone: An analog microphone input. USBC: A USB-C (input). USBInterface: A microphone or audio interface connected to a USB connector. WebView: The embedded web browser.",
        "name": "ConnectorType",
        "required": true,
        "valuespace": {
          "Values": [
            "AirPlay",
            "HDMI",
            "Microphone",
            "WebView",
            "Ethernet",
            "USBInterface",
            "USBC"
          ],
          "description": {},
          "type": "Literal"
        }
      },
      {
        "description": "The unique identifier of the local input. It was generated when the local input was created with the xCommand Audio LocalInput Add command.",
        "name": "InputId",
        "required": true,
        "valuespace": {
          "Max": "65534",
          "Min": "0",
          "Step": "1",
          "type": "Integer"
        }
      }
    ],
    "privacyimpact": "False",
    "read": [],
    "role": ["Admin", "Integrator"]
  },
  "id": 20344,
  "normPath": "Audio LocalInput AddConnector",
  "path": "Audio LocalInput AddConnector",
  "products": ["millennium"],
  "type": "Command"
},
```

Will be typed as such:

```ts
namespace xCommand = {
type Args = {
    Audio: {
        LocalInput = {
            AddConnector: {
            /**
            * Max: "8"
            * Min: "1"
            * Step: "1"
            * Description: Select a connector. The connectors' numbers are printed on the codec connector panel.
            */
            ConnectorId: number
            /**
            * Description: Select the type of the physical connector, device, or session to receive audio from. AirPlay: An active AirPlay session. Ethernet: An audio device (Cisco Table Microphone Pro / Cisco Microphone Array) on the codec's internal network. HDMI: An HDMI input. Microphone: An analog microphone input. USBC: A USB-C (input). USBInterface: A microphone or audio interface connected to a USB connector. WebView: The embedded web browser.
            */
            ConnectorType: "AirPlay" | "HDMI" | "Microphone" | "WebView" | "Ethernet" | "USBInterface" | "USBC";
            /**
            * Max: 65534
            * Min: 0
            * Step: 1
            * Description: The unique identifier of the local input. It was generated when the local input was created with the xCommand Audio LocalInput Add command.
            */
            InputId: number
            }
        }
    }
}
type Api = {
    Audio: {
        LocalInput: {
           /**
           Description: Attach an input connector to the local input given by the input ID. You must specify both the connector's type and number (ConnectorType, ConnectorId) to uniquely identify the connector. A connector can only be attached to one local input. Run xStatus Audio Input LocalInput to get an overview of all local inputs. This command is used by the Audio Console. If you don't use Audio Console, note that you must create a macro to make the audio chain definitions persistent over a reboot. Codec EQ: AVIntegrator option required.
           Roles: ["Admin", "User"]
           Access: "public-api"
           Backend: "any"
           */
            AddConnector: (arg0: Args.Audio.LocalInput) => Promise<xCommandReturnDefault>
        }
    }
}
    
    
}
```

It doesn't have to look exactly this. The goal is to have all of the types colocated, named, and 
documented for maximum developer experience. Honestly if nested namespaces works for all of this then
i would be okay with that. 

## Session Notes

- The schema generator now lives in `typegen/scripts/index.ts` and reads `typegen/schemas/11.33.1 October 2025.json`.
- The generator now emits a compact `typegen/schemas/11.33.1.ts` union of unique RoomOS entries plus `RoomOSSchema`, `RoomOSObject`, `RoomOSProduct`, `RoomOSProductTarget`, `RoomOSRoot`, and `xCommandReturnDefault`.
- `types.ts` consumes the generated `RoomOSObject` union directly and keeps the runtime `RoomOSWriteOperation`/`TRoomOSWriter` contract separate.
- The proxy/runtime layer is wired for all four roots and the writer handles terminal, XML, JSON-RPC, and HTTP serialization.
- `npm run typecheck` passes after regeneration.
- The generated `typegen/schemas/11.33.1.ts` file is ignored by git and lives in the workspace only.
