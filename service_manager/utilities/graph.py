"""Dependency graph helpers (DAG validation, ordering, closures)."""

from collections.abc import Iterable, Mapping


class CycleError(ValueError):
    def __init__(self, nodes: list[str]):
        self.nodes = nodes
        super().__init__(f"dependency cycle detected among: {', '.join(sorted(nodes))}")


def topo_layers(graph: Mapping[str, Iterable[str]]) -> list[list[str]]:
    """Kahn's algorithm. `graph` maps node -> nodes it depends on.

    Returns layers: every node's dependencies are in an earlier layer.
    Dependencies that are not keys of the graph are ignored (the caller validates them).
    """
    remaining = {n: {d for d in ds if d in graph} for n, ds in graph.items()}
    layers: list[list[str]] = []
    while remaining:
        ready = sorted(n for n, ds in remaining.items() if not ds)
        if not ready:
            raise CycleError(list(remaining))
        layers.append(ready)
        for n in ready:
            del remaining[n]
        for ds in remaining.values():
            ds.difference_update(ready)
    return layers


def dependencies_closure(graph: Mapping[str, Iterable[str]], targets: Iterable[str]) -> set[str]:
    """`targets` plus everything they (transitively) depend on."""
    seen: set[str] = set()
    stack = list(targets)
    while stack:
        n = stack.pop()
        if n in seen or n not in graph:
            continue
        seen.add(n)
        stack.extend(graph[n])
    return seen


def dependents_closure(graph: Mapping[str, Iterable[str]], targets: Iterable[str]) -> set[str]:
    """`targets` plus everything that (transitively) depends on them."""
    reverse: dict[str, set[str]] = {n: set() for n in graph}
    for n, ds in graph.items():
        for d in ds:
            reverse.setdefault(d, set()).add(n)
    return dependencies_closure(reverse, targets) & set(graph)
