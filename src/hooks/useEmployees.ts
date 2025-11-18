import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Employee {
  id: string;
  matricula: string;
  nome_completo: string;
  cargo: string;
}

export const useEmployees = () => {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("nome_completo");

      if (error) throw error;
      return data as Employee[];
    },
  });
};
