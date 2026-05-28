import { parseKML } from './kmlParser';
import { API_URL } from '../../config/apiConfig';

/**
 * Загружает и парсит KML данные по URL Google My Maps.
 * @param url - URL просмотра Google My Maps.
 * @returns Распарсенные KML данные или null при ошибке.
 */
export const fetchAndParseKML = async (url: string): Promise<any | null> => {
    if (!url || !url.trim()) return null;

    try {
        const midMatch = url.match(/mid=([^&\s]+)/);
        if (!midMatch) {
            console.error('Invalid KML URL: mid parameter not found.');
            return null;
        }

        const mid = midMatch[1];
        const exportUrl = `https://www.google.com/maps/d/u/0/kml?mid=${mid}&forcekml=1`;
        const proxyUrl = `${API_URL}/api/proxy/kml?url=${encodeURIComponent(exportUrl)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);

        const json = await response.json();
        const kmlText = json.contents;

        if (!kmlText || !kmlText.includes('<kml')) {
            console.error('Invalid KML data received from proxy.');
            return null;
        }

        return parseKML(kmlText);
    } catch (error) {
        console.error('Error fetching/parsing KML:', error);
        return null;
    }
};
