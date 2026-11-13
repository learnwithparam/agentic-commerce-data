# The pinned A2UI v1.0 schemas

These three files are copied, unchanged in content, from the A2UI project on GitHub: `specification/v1_0/json/`
at commit `58379ad4c7b23289992acea44e99126374e41063`. A2UI is under the Apache License 2.0.

- `agent_to_renderer.json`: the messages an agent may send.
- `common_types.json`: the shared parts, like a data binding.
- `catalog_definition.json`: what a catalog file looks like.

The course catalog, `catalog.json` in the part folder, takes the place of `catalog.json` in the schemas. For
example, its `Table` component needs `columns` and `rows`, and both point into the data model.
