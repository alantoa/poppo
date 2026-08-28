# universal-tooltip → poppo

`universal-tooltip` has been renamed to [`poppo`](https://www.npmjs.com/package/poppo)
as of 2.0. This package only re-exports `poppo`, so existing code keeps working:

```sh
yarn add poppo
```

```diff
- import { Tooltip } from "universal-tooltip";
+ import { Tooltip } from "poppo";
```

The native module ships in `poppo`; Expo autolinking picks it up as a
dependency of this package. New features and fixes land in `poppo` only.
