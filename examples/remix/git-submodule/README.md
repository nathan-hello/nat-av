# Git Submodule Example

This example is intended to be copied into an application that has nat-av
checked out as `vendor/nat-av`:

```sh
git submodule add <nat-av-repository> vendor/nat-av
```

The TypeScript and Vite aliases resolve the nat-av packages to their source
directories. The source workflow does not require building the submodule.

Use `tsconfig.vendor.json` when the example is copied into an application that
has the submodule at `vendor/nat-av`. Set `NAT_AV_ROOT=vendor/nat-av` for the
Vite configuration when running the application there.
