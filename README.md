# Setup Watcom

**setup-watcom** is a JavaScript GitHub Action (GHA) to setup an [Open Watcom](https://github.com/open-watcom) environment
 using the GHA [toolkit](https://github.com/actions/toolkit) for automatic caching.

This action sets up watcom for use in actions by:

- downloading a watcom release.
- set default Open Watcom environment variables (WATCOM + INCLUDE + PATH).
- failing if the specific version of Open Watcom is not available for download.

# Usage

See [action.yml](action.yml)

Basic:
```yaml
steps:
- uses: actions/checkout@v2
- uses: open-watcom/setup-watcom@v0
  with:
    version: "2.0"
- run: |
    wcl386 -zq -d+ -i"${{ env.WATCOM }}/h" -w3 -bt=dos -d2 -fomain.c.obj -c -cc main.c
    wlink option quiet name hello.exe opt map system dos4g debug all file main.c.obj
- run: |
    cmake -S . -B build -G "Watcom WMake" -D CMAKE_SYSTEM_NAME=DOS
    cmake --build build
```

Supported OW version is 1.8, 1.9, 2.0 and 2.0-64
