import { SupabaseClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from 'dotenv';
import jwt, { type Jwt } from 'jsonwebtoken';
import bodyParser from 'body-parser';
import { AddMapRequest, AddSourceRequest, AssembleMapRequest, DeleteMapRequest, GetMapRequest, type MapRow, type SourceRow } from './models';
import { createTempDir } from './utils';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';

config();

const app = express()
const port = 3000

// @ts-ignore-error
const supabase = new SupabaseClient(process.env.SUPABASE_PROJECT_URL, process.env.SUPABASE_SERVICE_JWT);

try {
    await supabase.storage.createBucket('pmtiles', { public: false, fileSizeLimit: null });
} catch (error) {
    console.error("error in creating bucket pmtiles");
    console.error(error);
}

try {
    await supabase.storage.createBucket('geojson', { public: false, fileSizeLimit: null }) 
} catch (error) {
    console.error("error in creating bucket geojson");
    console.error(error);
}

const JWT_SECRET = process.env.JWT_SECRET;

function checkAuth(req: Request, res: Response, next: NextFunction) {
    const jwtToken = req.headers.authorization;

    try {
        // @ts-ignore
        const jwtObj = jwt.verify(jwtToken, JWT_SECRET);
        // @ts-ignore
        res.jwt = jwtObj;
        next();
    } catch (error) {
        // @ts-ignore
        res.jwt = null;
        next();
    }
}

// middleware
app.use(bodyParser.json());
app.use(cors())
app.use(checkAuth);

app.get('/', (req, res) => {
    res.send('harita backend v1')
})

app.post('/newMap', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    if (!jwt) {
        res.status(401).send('Unauthorized');
        return;
    }

    const request = AddMapRequest.safeParse(req.body);

    if (!request.success) {
        res.status(400).send('Bad Request');
        return;
    }

    const supabaseRes = await supabase.from('maps').upsert({
        name: request.data.name,
        description: request.data.description,
        user: jwt.sub,
        public: request.data.public,
    }).select().single();

    const { data, error } = supabaseRes as PostgrestSingleResponse<MapRow>;

    if (error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json({
        id: data.id,
    });
})

app.get('/maps', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    if (!jwt) {
        res.status(401).send('Unauthorized');
        return;
    }

    const supabaseRes = await supabase.from('maps').select().eq('user', jwt.sub);

    const { data, error } = supabaseRes as PostgrestSingleResponse<MapRow[]>;

    if (error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.post('/addSource', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    if (!jwt) {
        res.status(401).send('Unauthorized');
        return;
    }

    const request = AddSourceRequest.safeParse(req.body);

    if (!request.success) {
        res.status(400).send('Bad Request');
        return;
    }

    const supabaseRes = await supabase.from('sources').upsert({
        name: request.data.name,
        map: request.data.mapId,
        color: request.data.color,
        format: request.data.format,
    }).select().single();


    const { data, error } = supabaseRes as PostgrestSingleResponse<SourceRow>;

    if (error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    if (request.data.format === 'pmtiles') {
        const signedUrlRes = await supabase.storage.from('pmtiles').createSignedUploadUrl(`${data.id}.pmtiles`);
        
        if (signedUrlRes.error) {
            res.status(500).send('Internal Server Error');
            return;
        }

        const resp: Record<string, any> = signedUrlRes.data;
        resp.sourceId = data.id;
        res.json(signedUrlRes.data);
    } else if (request.data.format === 'geojson') {
        const signedUrlRes = await supabase.storage.from('geojson').createSignedUploadUrl(`${data.id}.geojson`);
        
        if (signedUrlRes.error) {
            res.status(500).send('Internal Server Error');
            return;
        }

        const resp: Record<string, any> = signedUrlRes.data;
        resp.sourceId = data.id;
        res.json(resp);
    } else {
        res.status(400).send('Bad Request');
    }
});

app.post('/deleteMap', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    if (!jwt) {
        res.status(401).send('Unauthorized');
        return;
    }

    const request = DeleteMapRequest.safeParse(req.body);

    if (!request.success) {
        res.status(400).send('Bad Request');
        return;
    }

    const supabaseRes = await supabase.from('maps').delete().eq('id', request.data.id).eq('user', jwt.sub);

    if (supabaseRes.error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json({ success: true });
});

app.post('/assembleMap', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    if (!jwt) {
        res.status(401).send('Unauthorized');
        return;
    }

    const request = AssembleMapRequest.safeParse(req.body);

    if (!request.success) {
        res.status(400).send('Bad Request');
        return;
    }

    const supabaseRes = await supabase.from('sources').select().eq('map', request.data.id);

    const { data, error } = supabaseRes as PostgrestSingleResponse<SourceRow[]>;

    if (error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    const tempDir = createTempDir();

    for (const sr of data) {
        if (sr.format === "geojson") {
            const signedUrlRes = await supabase.storage.from('geojson').createSignedUrl(`${sr.id}.geojson`, 180);
            
            if (signedUrlRes.error) {
                res.status(500).send('Internal Server Error');
                return;
            }

            const url = signedUrlRes.data.signedUrl;

            const geojsonFilePath = path.join(tempDir, `${sr.id}.geojson`);
            const pmtilesFilePath = path.join(tempDir, `${sr.id}.pmtiles`);

            await Bun.spawn({
                cmd: ['wget', '-O', geojsonFilePath, url],
            }).exited;

            await Bun.spawn({
                cmd: ["tippecanoe", "-zg", "--projection=EPSG:4326", "-o", pmtilesFilePath, "-l", sr.name, geojsonFilePath],
            }).exited;

            await supabase.storage.from('pmtiles').upload(`${sr.id}.pmtiles`, await Bun.file(pmtilesFilePath).arrayBuffer());
            await supabase.from('sources').update({ format: 'pmtiles' }).eq('id', sr.id);
        }
    }

    fs.rmdirSync(tempDir, { recursive: true });

    res.json({ success: true });
});

app.post('/getMap', async (req, res) => {
    // @ts-ignore
    const jwt: jwt.JwtPayload | null = res.jwt;

    const request = GetMapRequest.safeParse(req.body);

    if (!request.success) {
        res.status(400).send('Bad Request');
        return;
    }

    const supabaseRes: PostgrestSingleResponse<MapRow> = await supabase.from('maps').select().eq('id', request.data.id).single();

    if (supabaseRes.error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    const map = supabaseRes.data;

    if (!map.public && (!jwt || map.user !== jwt.sub)) {
        res.status(401).send('Unauthorized');
        return;
    }

    const supabaseRes2 = await supabase.from('sources').select().eq('map', request.data.id) as PostgrestSingleResponse<SourceRow[]>;

    if (supabaseRes2.error) {
        res.status(500).send('Internal Server Error');
        return;
    }

    const sources = supabaseRes2.data;

    const resp = {
        ...map,
        sources: [] as object[],
    };

    for (const s of sources) {
        if (s.format === 'pmtiles') {
            const signedUrlRes = await supabase.storage.from('pmtiles').createSignedUrl(`${s.id}.pmtiles`, 3600);

            if (signedUrlRes.error) {
                res.status(500).send('Internal Server Error');
                return;
            }
            
            resp.sources.push({
                ...s,
                url: signedUrlRes.data.signedUrl,
            });
        }
    }

    res.json(resp);
});



app.listen(port, () => {
    console.log(`harita backend listening on port ${port}`)
})
      