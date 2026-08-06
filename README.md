# nat-av

This is my idea of creating a web server that acts as what AV integrators call
a control processor. It's a server that is capable of interacting with other
devices on a local network, updating internal state based off of the responses,
and building on top of that, generate a typesafe RPC layer from server to client.

The actual `av` part lives in `./vendor/av`, and driver implementations are in
`./vendor/drivers/`. 

This repo should be considered a (very well thought out) beta project. The `./vendor/av`
repo is about 4k LOC, so please poke around and find things to edit. The type system
seems overly complex, but that's mostly just because of the requirement of the RPC layer
found in `./vendor/drivers/natav/rpc/`.

If you are just curious and don't feel like doing a full `npm install`, just
look at the test files to learn how the library is used. You can run `npm test`
to verify that all the tests pass, but read
`./vendor/drivers/cisco/roomos/README.md` first before running test because if
you don't have that set up then it won't pass. 

I haven't done much on the UI side other than testing the client-side RPC
bindings. This repo isn't about creating an [Abstract Program
Factory](https://reluekiss.com/nathan/p/100039), it's about creating the Driver
class, the type system around it, RPC bindings, and driver implementations to
test out the ergonomics. For now.

### Why not an NPM package?

Often, when I'm on site, I don't have access to the internet. If I were to use
an NPM package, then I would need to remember to clone the repo before
deployment, and if I needed to change something about the library because I
encountered a bug, I would need to point my `package.json` towards the local
copy anyways. The ability to change almost every part of the program offline is
extremely important to me. So for me, I will be sticking to using git
submodules at the very least, and this repo will likely turn into just the
`./vendor/av` folder with `./vendor/drivers/` being a separate repo. I haven't
done this yet because **I have not used this library in production yet**. This
repo is a proof of concept, and I just so happen to enjoy the currently-in-beta
project [Remix 3](https://github.com/remix-run/remix). There is no reason why
this project wouldn't work just as well in React, Vue, etc.

### AGENTS.md

I know this will turn some of you off, that I have several AGENTS.md files, so
I want to go out ahead and say this project was not vibe coded. Much of the
work isn't the amount of code, because it's honestly not that complicated, it's
the theorizing of what abstractions will work and what won't. When I eventually
do use this in production, I don't want to have doubts and change the type
system around too much because then I have to update all of the drivers to
accomodate (ask me how I know). However, I have been using LLM assistance for
several parts of the application/library. Specifically, the Dante router that
is implemented in `./vendor/drivers/dante/router/` was written almost entirely
by Deepseek V4 Pro based off of the implementation of the public domain
licensed
[network-audio-controller](https://github.com/chris-ritsen/network-audio-controller)
project.

That said, they are there for the chatbots. Use them! 
