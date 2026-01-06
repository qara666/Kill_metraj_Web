import { type Order, getCachedDistance } from './routeOptimizationHelpers';

/**
 * Оптимизация порядка заказов внутри маршрута методом 2-opt.
 * Метод последовательно меняет местами два ребра графа, если это уменьшает общую дистанцию.
 * В данном случае используется Haversine расстояние для скорости.
 */
export function optimizeRouteOrder2Opt(
    route: Order[],
    context: {
        startCoords?: { lat: number; lng: number } | null;
        endCoords?: { lat: number; lng: number } | null;
    }
): Order[] {
    if (route.length <= 2) return route;

    let bestRoute = [...route];
    let improved = true;

    // Функция для расчета общей дистанции маршрута
    const calculateTotalDist = (r: Order[]) => {
        let dist = 0;
        if (context.startCoords && r[0].coords) {
            dist += getCachedDistance(context.startCoords as any, r[0].coords);
        }
        for (let i = 0; i < r.length - 1; i++) {
            if (r[i].coords && r[i + 1].coords) {
                dist += getCachedDistance(r[i].coords!, r[i + 1].coords!);
            }
        }
        if (context.endCoords && r[r.length - 1].coords) {
            dist += getCachedDistance(r[r.length - 1].coords, context.endCoords as any);
        }
        return dist;
    };

    let bestDist = calculateTotalDist(bestRoute);

    // Ограничиваем количество итераций для производительности
    let iterations = 0;
    const maxIterations = 50;

    while (improved && iterations < maxIterations) {
        improved = false;
        iterations++;

        for (let i = 0; i < bestRoute.length - 1; i++) {
            for (let j = i + 1; j < bestRoute.length; j++) {
                // Пробуем перевернуть сегмент между i и j
                const newRoute = [
                    ...bestRoute.slice(0, i),
                    ...bestRoute.slice(i, j + 1).reverse(),
                    ...bestRoute.slice(j + 1)
                ];

                const newDist = calculateTotalDist(newRoute);

                if (newDist < bestDist - 0.01) { // 0.01км запас
                    bestRoute = newRoute;
                    bestDist = newDist;
                    improved = true;
                }
            }
        }
    }

    return bestRoute;
}
