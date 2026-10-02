import { register } from "node:module";
import "./dnsFix.mjs";

register("./hooks.mjs", import.meta.url);
